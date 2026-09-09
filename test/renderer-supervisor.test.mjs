import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
  attachRendererTarget,
  buildGuardedRendererSource,
  isMainRendererTarget,
} from "../lib/renderer-supervisor.mjs";

test("selects only the main ChatGPT renderer", () => {
  const target = (url, type = "page") => ({
    id: "target",
    type,
    url,
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/target",
  });
  assert.equal(isMainRendererTarget(target("app://-/index.html")), true);
  assert.equal(
    isMainRendererTarget(target("app://-/index.html?initialRoute=%2Fthreads")),
    true,
  );
  assert.equal(
    isMainRendererTarget(target("app://-/index.html?initialRoute=%2Favatar-overlay")),
    false,
  );
  assert.equal(isMainRendererTarget(target("https://example.com/index.html")), false);
  assert.equal(isMainRendererTarget(target("app://-/index.html", "worker")), false);
});

test("guarded renderer source is idempotent in one document", () => {
  const source = `(() => {
    window.injections = (window.injections || 0) + 1;
    const api = { version: "test", destroy() { window.destroyed = true; } };
    window.__spineCodexViewV1 = api;
    return api.version;
  })()`;
  const guarded = buildGuardedRendererSource(source);
  const context = { window: {} };
  assert.equal(vm.runInNewContext(guarded, context), "test");
  assert.equal(vm.runInNewContext(guarded, context), "test");
  assert.equal(context.window.injections, 1);
  assert.equal(context.window.destroyed, undefined);
});

test("keeps the CDP session open and reinjects after a load event", async () => {
  class MockWebSocket extends EventTarget {
    static instance;
    sent = [];

    constructor() {
      super();
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }

    send(payload) {
      const request = JSON.parse(payload);
      this.sent.push(request);
      queueMicrotask(() => {
        const event = new Event("message");
        Object.defineProperty(event, "data", {
          value: JSON.stringify({ id: request.id, result: {} }),
        });
        this.dispatchEvent(event);
      });
    }

    close() {
      this.dispatchEvent(new Event("close"));
    }
  }

  const session = await attachRendererTarget({
    target: {
      id: "main",
      type: "page",
      url: "app://-/index.html",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/main",
    },
    port: 9222,
    source: "window.__probe = (window.__probe || 0) + 1",
    WebSocketImpl: MockWebSocket,
  });

  assert.deepEqual(
    MockWebSocket.instance.sent.map((request) => request.method),
    ["Page.enable", "Page.addScriptToEvaluateOnNewDocument", "Runtime.evaluate"],
  );

  const loadEvent = new Event("message");
  Object.defineProperty(loadEvent, "data", {
    value: JSON.stringify({ method: "Page.loadEventFired", params: {} }),
  });
  MockWebSocket.instance.dispatchEvent(loadEvent);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    MockWebSocket.instance.sent.filter((request) => request.method === "Runtime.evaluate").length,
    2,
  );

  session.close();
  assert.equal(await session.closed, "closed");
});

test("rejects non-loopback CDP endpoints", async () => {
  await assert.rejects(
    attachRendererTarget({
      target: {
        id: "unsafe",
        webSocketDebuggerUrl: "ws://example.com:9222/devtools/page/unsafe",
      },
      port: 9222,
      source: "true",
      WebSocketImpl: class {},
    }),
    /unsafe CDP WebSocket URL/,
  );
});

test('owned Desktop survives CDP outage and replacement target without stopping supervision', async () => {
  const abort = new AbortController();
  const sockets = [];
  class Socket extends EventTarget {
    closed = false;
    constructor(url) { super(); this.url=url; sockets.push(this); queueMicrotask(()=>this.dispatchEvent(new Event('open'))); }
    send(payload) {const request=JSON.parse(payload);queueMicrotask(()=>{const event=new Event('message');Object.defineProperty(event,'data',{value:JSON.stringify({id:request.id,result:{}})});this.dispatchEvent(event);});}
    close() {this.closed=true;this.dispatchEvent(new Event('close'));}
  }
  const { superviseRenderer } = await import('../lib/renderer-supervisor.mjs');
  let calls=0;
  await superviseRenderer({port:9222,rendererSource:'(()=>true)()',WebSocketImpl:Socket,signal:abort.signal,isDesktopRunning:()=>true,pollIntervalMs:0,shutdownGraceMs:0,
    fetchImpl:async()=>{
      calls++;
      if(calls===2)throw Error('temporary disconnect');
      if(calls===4)abort.abort();
      const id=calls===1?'before':'after';
      return {ok:true,json:async()=>[{id,type:'page',url:'app://-/index.html',webSocketDebuggerUrl:`ws://127.0.0.1:9222/devtools/page/${id}`}]};
    },
  });
  assert.equal(sockets.length,2);
  assert.equal(sockets.every(socket=>socket.closed),true);
  assert.equal(calls,4);
});
