import * as crypto from 'node:crypto';
import * as path from 'node:path';

import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { z } from 'zod';

import { DomSanitizer } from '../utils/DomSanitizer';

import { FragmentSegmenter } from './FragmentSegmenter';
import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';
import { scoreElementInContext } from './LocatorScorer';

export interface HtmlToFragmentInput {
  html: string;
  fragmentName: string;
  outputDir: string;
}

const fragmentSchema = z.object({
  name: z.string().min(1),
  fragmentTs: z.string().min(1),
});

const outputSchema = z.object({
  fragments: z.array(fragmentSchema).min(1),
  pageTs: z.string().min(1),
  stepsTs: z.string().min(1),
  testTs: z.string().min(1),
});

export type HtmlToFragmentOutput = z.infer<typeof outputSchema>;

interface AgentDeps {
  pipeline?: GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput>;
  sanitizer?: DomSanitizer;
  segmenter?: FragmentSegmenter;
  postValidate?: (files: HtmlToFragmentOutput) => Promise<string[]>;
}

/** Interactive element tags worth extracting for locator scoring. */
const INTERACTIVE_TAGS = ['input', 'button', 'select', 'textarea', 'a', 'label'];

/**
 * Build a structured element list scored against the full-page DOM (for
 * accurate uniqueness counts). Organises results by tag for the LLM prompt.
 */
function buildElementList($: cheerio.CheerioAPI): string {
  const elements: Array<{ tag: string; top3: string[] }> = [];

  INTERACTIVE_TAGS.forEach((tag) => {
    $(tag).each((_, el) => {
      const candidates = scoreElementInContext($, el as Element, { topN: 3 });
      if (candidates.length > 0) {
        // Mark unstable selectors so the LLM knows to avoid them as primary
        const top3 = candidates.map((c) => (c.stable ? c.selector : `${c.selector} ⚠unstable`));
        elements.push({ tag, top3 });
      }
    });
  });

  return JSON.stringify(elements);
}

function buildConfig(
  deps: AgentDeps,
  sanitizer: DomSanitizer,
  segmenter: FragmentSegmenter,
): PipelineConfig<HtmlToFragmentInput, HtmlToFragmentOutput> {
  return {
    agentName: 'html-to-fragment',
    promptTemplate: 'html-to-fragment',
    outputSchema,

    inputHasher: (input) =>
      crypto.createHash('sha256').update(`${input.fragmentName}:${input.html}`).digest('hex'),

    contextBuilder: async (input) => {
      // Score elements against the original sanitized DOM (hashes intact → selectors work in browser)
      const sanitizedForScoring = sanitizer.sanitize(input.html);
      const $ = cheerio.load(sanitizedForScoring);
      const elements = buildElementList($);

      // Send the LLM a class-normalized view (strips __HASH so it reads semantic names)
      // Cap at ~24 000 chars (~6 000 tokens) so slow/free-tier providers don't time out.
      const MAX_DOM_CHARS = 24_000;
      let domForLlm = sanitizer.sanitize(input.html, { normalizeHashedClasses: true });
      const domTruncated = domForLlm.length > MAX_DOM_CHARS;
      if (domTruncated) {
        domForLlm =
          domForLlm.slice(0, MAX_DOM_CHARS) + '\n<!-- [DOM truncated for LLM context limit] -->';
      }

      // Detect logical regions to guide multi-fragment generation
      const segments = segmenter.segment(sanitizedForScoring);

      const rawKb = Math.round(input.html.length / 1024);
      const sanitizedKb = Math.round(domForLlm.length / 1024);
      const elementCount = JSON.parse(elements).length as number;
      process.stderr.write(
        `  [gen] raw=${rawKb}KB → sanitized=${sanitizedKb}KB${domTruncated ? ' (truncated)' : ''} | elements=${elementCount} | segments=${segments.length}\n`,
      );

      return {
        fragmentName: input.fragmentName,
        dom: domForLlm,
        elements,
        segments: JSON.stringify(segments),
        hasSegments: segments.length > 0,
      };
    },

    outputMapper: (input, output) => {
      const fileMap: Record<string, string> = {};

      for (const frag of output.fragments) {
        const fragName = frag.name.endsWith('Fragment') ? frag.name : `${frag.name}Fragment`;
        fileMap[path.join(input.outputDir, 'fragments', 'features', `${fragName}.ts`)] =
          frag.fragmentTs;
      }

      fileMap[path.join(input.outputDir, 'pages', `${input.fragmentName}Page.ts`)] = output.pageTs;
      fileMap[path.join(input.outputDir, 'steps', `${input.fragmentName}Steps.ts`)] =
        output.stepsTs;
      fileMap[
        path.join(
          process.cwd(),
          'tests',
          'ui',
          'smoke',
          `${input.fragmentName.toLowerCase()}.test.ts`,
        )
      ] = output.testTs;

      return fileMap;
    },

    postValidate: deps.postValidate,
  };
}

/**
 * Converts a live page's HTML into a set of typed Fragment classes + a Page
 * Object + smoke tests. Pre-processing steps:
 *
 * 1. `DomSanitizer` strips noise (scripts, SVG, hashed classes for the LLM view).
 * 2. `LocatorScorer` scores every interactive element against the full-page DOM
 *    so uniqueness boosts are accurate and hashed CSS-Module selectors are
 *    penalised in favour of stable aria/id/data-testid selectors.
 * 3. `FragmentSegmenter` identifies semantic regions (header/nav/hero/footer …)
 *    and passes them as structured context so the LLM generates one Fragment
 *    per logical UI component rather than one monolithic class.
 */
export class HtmlToFragmentAgent {
  private readonly pipeline: GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput>;

  constructor(deps: AgentDeps = {}) {
    const sanitizer = deps.sanitizer ?? new DomSanitizer();
    const segmenter = deps.segmenter ?? new FragmentSegmenter();
    const config = buildConfig(deps, sanitizer, segmenter);
    this.pipeline =
      deps.pipeline ??
      new GenerationPipeline(config, {
        cache: new GenerationCache(),
      });
  }

  async run(input: HtmlToFragmentInput, opts: RunOpts = {}): Promise<HtmlToFragmentOutput> {
    return this.pipeline.run(input, opts);
  }
}
