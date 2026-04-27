import * as crypto from 'node:crypto';
import * as path from 'node:path';

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { DomSanitizer } from '../utils/DomSanitizer';

import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';
import { scoreElements } from './LocatorScorer';

export interface HtmlToFragmentInput {
  html: string;
  fragmentName: string;
  outputDir: string;
}

const outputSchema = z.object({
  fragmentTs: z.string().min(1),
  pageTs: z.string().min(1),
  testTs: z.string().min(1),
});

export type HtmlToFragmentOutput = z.infer<typeof outputSchema>;

interface AgentDeps {
  pipeline?: GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput>;
  sanitizer?: DomSanitizer;
  postValidate?: (files: HtmlToFragmentOutput) => Promise<string[]>;
}

/** Interactive element tags worth extracting for locator scoring. */
const INTERACTIVE_TAGS = ['input', 'button', 'select', 'textarea', 'a', 'label'];

function buildElementList($: cheerio.CheerioAPI): string {
  const elements: Array<{ tag: string; top5: string[] }> = [];
  INTERACTIVE_TAGS.forEach((tag) => {
    $(tag).each((_, el) => {
      const outerHtml = $.html(el);
      if (!outerHtml) return;
      const candidates = scoreElements(outerHtml, { topN: 5 });
      if (candidates.length > 0) {
        elements.push({ tag, top5: candidates.map((c) => c.selector) });
      }
    });
  });
  return JSON.stringify(elements);
}

function buildConfig(
  deps: AgentDeps,
  sanitizer: DomSanitizer,
): PipelineConfig<HtmlToFragmentInput, HtmlToFragmentOutput> {
  return {
    agentName: 'html-to-fragment',
    promptTemplate: 'html-to-fragment',
    outputSchema,

    inputHasher: (input) =>
      crypto.createHash('sha256').update(`${input.fragmentName}:${input.html}`).digest('hex'),

    contextBuilder: async (input) => {
      const sanitized = sanitizer.sanitize(input.html);
      const $ = cheerio.load(sanitized);
      const elements = buildElementList($);
      return {
        fragmentName: input.fragmentName,
        dom: sanitized,
        elements,
      };
    },

    outputMapper: (input, files) => ({
      [path.join(input.outputDir, 'fragments', 'features', `${input.fragmentName}Fragment.ts`)]: files.fragmentTs,
      [path.join(input.outputDir, 'pages', `${input.fragmentName}Page.ts`)]: files.pageTs,
      [path.join(process.cwd(), 'tests', 'ui', 'smoke', `${input.fragmentName.toLowerCase()}.test.ts`)]: files.testTs,
    }),

    postValidate: deps.postValidate,
  };
}

/**
 * Converts sanitized HTML into a Fragment + Page + Test triple using the
 * shared `GenerationPipeline`. DomSanitizer strips noise before the DOM
 * reaches the LLM; LocatorScorer pre-scores interactable elements so the
 * model only needs to name and organize — not hallucinate selectors.
 */
export class HtmlToFragmentAgent {
  private readonly pipeline: GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput>;

  constructor(deps: AgentDeps = {}) {
    const sanitizer = deps.sanitizer ?? new DomSanitizer();
    const config = buildConfig(deps, sanitizer);
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
