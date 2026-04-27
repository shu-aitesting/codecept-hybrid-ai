Feature('FileSystem — download & export validation').tag('@api').tag('@smoke');

// FileSystem helper methods used here:
//   I.amInPath(dir)           — set working directory for file assertions
//   I.writeToFile(name, text) — create a file (useful for seeding test fixtures)
//   I.seeFile(name)           — assert file exists
//   I.seeInThisFile(text)     — assert file contains text
//   I.dontSeeInThisFile(text) — assert file does NOT contain text
//   I.seeFileContentsEqual(text) — assert exact file contents
//   I.grabFileNames()         — returns string[] of filenames in current dir
//   I.waitForFile(name, sec)  — wait until file appears (async download)

Scenario('Write and verify a fixture file', async ({ I }) => {
  I.amInPath('output');
  I.writeToFile('test-fixture.json', JSON.stringify({ id: 1, name: 'Test User' }));

  I.seeFile('test-fixture.json');
  I.seeInThisFile('"name"');
  I.seeInThisFile('Test User');
  I.dontSeeInThisFile('password');
});

Scenario('Grab file list from output directory', async ({ I }) => {
  I.amInPath('output');
  I.writeToFile('sample-a.txt', 'data-a');
  I.writeToFile('sample-b.txt', 'data-b');

  // grabFileNames() returns string[] — use seeFileNameMatching for assertions
  // (CodeceptJS step wrapper does not propagate synchronous return values)
  I.seeFile('sample-a.txt');
  I.seeFile('sample-b.txt');
  I.seeFileNameMatching('sample');
});

Scenario('Verify exact contents of a generated report file', async ({ I }) => {
  const reportContent = 'status,count\npassed,10\nfailed,2';

  I.amInPath('output');
  I.writeToFile('report.csv', reportContent);

  I.seeFile('report.csv');
  I.seeFileContentsEqual(reportContent);
  I.seeInThisFile('passed,10');
});
