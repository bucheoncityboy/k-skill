"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");

const run = promisify(execFile);
const repoRoot = path.join(__dirname, "..");
const skillDir = path.join(repoRoot, "korean-interest-rate-analysis");
const cli = path.join(skillDir, "scripts", "korean_interest_rate_analysis.mjs");
const artifactNames = [
  "brief.md",
  "evidence.json",
  "manifest.json",
  "market-table.csv",
  "report.html",
  "status.json",
];

function fixtureCsv() {
  const rates = {
    "2026-09-11": [3.9, 4.0, 4.2, 4.5, 4.55, 4.6],
    "2026-09-18": [3.93, 4.02, 4.25, 4.46, 4.49, 4.57],
  };
  const tenors = [2, 3, 5, 10, 20, 30];
  return [
    "date,tenor,yield_pct",
    ...Object.entries(rates).flatMap(([date, values]) =>
      tenors.map((tenor, index) => `${date},${tenor},${values[index]}`),
    ),
  ].join("\n");
}

async function sha(file) {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

test("interest-rate analysis helper exposes the documented CLI", async () => {
  const { stdout } = await run(process.execPath, [cli, "--help"], { cwd: skillDir });
  assert.match(stdout, /@nomadamas\/k-skill@0 exec korean-interest-rate-analysis scripts\/korean_interest_rate_analysis\.mjs --/);
  assert.match(stdout, /--preset today\|dashboard/);
  assert.match(stdout, /--news-evidence FILE\.json/);
  assert.match(stdout, /--replay evidence\.json/);
});

test("curve math validates units, dates, and classification", async () => {
  const core = await import(pathToFileURL(path.join(skillDir, "scripts", "core.mjs")).href);
  assert.equal(core.bp(4.056, 4.035), 2.1);
  assert.equal(core.date("2026-02-28"), "2026-02-28");
  assert.throws(() => core.date("2026-02-29"), /Invalid date/);
  assert.throws(
    () => core.csvRead("date,tenor,yield_pct\n2026-09-18,7,4.0\n"),
    /Invalid tenor\/value/,
  );
  assert.match(core.classify(2, -1), /플래트닝/);
});

test("ECOS parser rejects metadata and accepts a complete official row", async () => {
  const collect = await import(pathToFileURL(path.join(skillDir, "scripts", "collect.mjs")).href);
  const row = {
    STAT_CODE: "817Y002",
    STAT_NAME: "1.3.2.1. 시장금리(일별)",
    ITEM_CODE1: "010200000",
    ITEM_NAME1: "국고채(3년)",
    UNIT_NAME: "연%",
    TIME: "20260918",
    DATA_VALUE: "4.020",
  };
  const valid = JSON.stringify({ StatisticSearch: { list_total_count: 1, row: [row] } });
  assert.deepEqual(collect.parse(valid, 3, "2026-09-18", "2026-09-18"), [
    { date: "2026-09-18", tenor: 3, value: 4.02 },
  ]);
  const invalid = JSON.stringify({
    StatisticSearch: { list_total_count: 1, row: [{ ...row, UNIT_NAME: "bp" }] },
  });
  assert.throws(() => collect.parse(invalid, 3, "2026-09-18", "2026-09-18"), /metadata\/unit/);
});

test("news evidence enforces host, KST date, direction, and fingerprint", async () => {
  const news = await import(pathToFileURL(path.join(skillDir, "scripts", "news.mjs")).href);
  const input = {
    version: 1,
    observationDate: "2026-09-18",
    retrievedAt: "2026-09-18T12:00:00.000Z",
    articles: [
      {
        publisher: "연합인포맥스",
        title: "[채권-마감] 금리 하락 시장 배경",
        url: "https://news.einfomax.co.kr/news/articleView.html?idxno=1",
        publishedAt: "2026-09-18T09:00:00.000Z",
        sourceType: "market-close",
        marketDirection: "lower",
        relation: "explicit",
        factor: "외국인의 국채선물 순매수",
        evidenceSummary: "연합인포맥스는 외국인 국채선물 순매수를 금리 하락의 배경으로 전했다.",
      },
    ],
  };
  const parsed = news.newsRead(JSON.stringify(input));
  assert.match(parsed.articles[0].sourceFingerprint, /^[a-f0-9]{64}$/);
  const badHost = structuredClone(input);
  badHost.articles[0].url = "https://example.com/article";
  assert.throws(() => news.newsRead(JSON.stringify(badHost)), /Unapproved news host/);
  const badDate = structuredClone(input);
  badDate.articles[0].publishedAt = "2026-09-17T09:00:00.000Z";
  assert.throws(() => news.newsRead(JSON.stringify(badDate)), /date alignment/);
});

test("report bundle is byte-identical when replayed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "korean-interest-rate-analysis-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const input = path.join(root, "input.csv");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await fs.writeFile(input, fixtureCsv());
  await run(process.execPath, [
    cli,
    "--input",
    input,
    "--base",
    "2026-09-11",
    "--as-of",
    "2026-09-18",
    "--out",
    first,
  ], { cwd: skillDir });
  await run(process.execPath, [
    cli,
    "--replay",
    path.join(first, "evidence.json"),
    "--out",
    second,
  ], { cwd: skillDir });
  for (const name of artifactNames) {
    assert.equal(await sha(path.join(first, name)), await sha(path.join(second, name)), name);
  }
  const status = JSON.parse(await fs.readFile(path.join(first, "status.json"), "utf8"));
  const html = await fs.readFile(path.join(first, "report.html"), "utf8");
  assert.equal(status.status, "READY");
  assert.equal(status.usable, true);
  assert.equal((html.match(/class="value-label/g) ?? []).length, 12);
  assert.doesNotMatch(html, /원문 SHA-256|근거 SHA-256/);
});
