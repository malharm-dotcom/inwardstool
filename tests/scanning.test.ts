import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { CameraGate, parseQueue } from "../src/lib/scanning";

test("camera counts a held code once and rearms only after a sustained absence", () => {
  const gate = new CameraGate();
  assert.equal(gate.accept("4MST2268-03-L", 0), true);
  assert.equal(gate.accept("4MST2268-03-L", 500), false);
  assert.equal(gate.accept(null, 600), false);
  assert.equal(gate.accept("4MST2268-03-L", 700), false);
  gate.accept(null, 800);
  gate.accept(null, 1900);
  assert.equal(gate.accept("4MST2268-03-L", 2000), true);
  assert.equal(gate.accept("ANOTHER-SKU", 2100), false);
  assert.equal(gate.accept("4MST2268-03-L", 2200), false);
});
test("pending queue parsing refuses corrupt data instead of silently discarding scans", () => {
  const item = {
    requestId: randomUUID(),
    sku: "4MST2268-03-L",
    shelfCode: "FRONT_OFFICE",
    source: "SCANNER",
  };
  assert.deepEqual(parseQueue(JSON.stringify([item])), [item]);
  assert.deepEqual(parseQueue(null), []);
  assert.throws(() => parseQueue("{"));
  assert.throws(() =>
    parseQueue(JSON.stringify([{ ...item, sku: "=SUM(1)" }])),
  );
  assert.throws(() => parseQueue(JSON.stringify([item, item])));
});
