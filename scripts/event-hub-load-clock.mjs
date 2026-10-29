/** Internal child-process fixture only. Not imported by application entrypoints. */
const u = new URL(process.env.DATABASE_URL ?? "invalid:");
if (
  process.env.NODE_ENV !== "development" ||
  u.hostname !== "127.0.0.1" ||
  ![
    "/binpc2_hub_load_v6",
    "/binpc2_hub_browser_v6",
    "/binpc2_hub_browser_current",
    "/binpc2_hub_browser_v4",
    "/binpc2_hub_dev",
  ].includes(u.pathname) ||
  u.search !== "?sslmode=disable"
)
  throw Error("Refusing a non-isolated load-clock fixture");
const NativeDate = Date,
  offset = Number(process.env.HUB_LOAD_CLOCK_OFFSET_MS);
if (!Number.isFinite(offset)) throw Error("Explicit fixture clock required");
class Clock extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [NativeDate.now() + offset]));
  }
  static now() {
    return NativeDate.now() + offset;
  }
}
globalThis.Date = Clock;
let previousCpu = process.cpuUsage(),
  previousTime = performance.now();
setInterval(() => {
  const current = process.cpuUsage(),
    at = performance.now(),
    elapsed = at - previousTime;
  process.send?.({
    type: "load-resource-sample",
    at: NativeDate.now(),
    memory: process.memoryUsage(),
    cpuPercent:
      ((current.user + current.system - previousCpu.user - previousCpu.system) /
        1000 /
        elapsed) *
      100,
  });
  previousCpu = current;
  previousTime = at;
}, 5000).unref();
