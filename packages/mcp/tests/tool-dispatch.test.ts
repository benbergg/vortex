import { describe, it, expect } from "vitest";
import { dispatchNewTool } from "../src/tools/dispatch.js";

describe("dispatchNewTool", () => {
  it("vortex_navigate → page.navigate 默认", () => {
    const { action } = dispatchNewTool("vortex_navigate", { url: "http://e.com" })!;
    expect(action).toBe("page.navigate");
  });

  it("vortex_navigate reload:true → page.reload", () => {
    const { action } = dispatchNewTool("vortex_navigate", { reload: true })!;
    expect(action).toBe("page.reload");
  });

  it("vortex_navigate reload:true 不透传 reload 字段", () => {
    const { params } = dispatchNewTool("vortex_navigate", { reload: true, url: "http://e.com" })!;
    expect(params).not.toHaveProperty("reload");
  });

  it("vortex_history direction:forward → page.forward", () => {
    const { action } = dispatchNewTool("vortex_history", { direction: "forward" })!;
    expect(action).toBe("page.forward");
  });

  it("vortex_history direction:back → page.back", () => {
    const { action } = dispatchNewTool("vortex_history", { direction: "back" })!;
    expect(action).toBe("page.back");
  });

  it("vortex_history 省略 direction → page.back（默认）", () => {
    const { action } = dispatchNewTool("vortex_history", {})!;
    expect(action).toBe("page.back");
  });

  it("vortex_wait_idle kind:dom → dom.waitSettled", () => {
    const { action } = dispatchNewTool("vortex_wait_idle", { kind: "dom" })!;
    expect(action).toBe("dom.waitSettled");
  });

  it("vortex_wait_idle kind:network → page.waitForNetworkIdle", () => {
    const { action } = dispatchNewTool("vortex_wait_idle", { kind: "network" })!;
    expect(action).toBe("page.waitForNetworkIdle");
  });

  it("vortex_wait_idle kind:xhr → page.waitForXhrIdle", () => {
    const { action } = dispatchNewTool("vortex_wait_idle", { kind: "xhr" })!;
    expect(action).toBe("page.waitForXhrIdle");
  });

  it("vortex_wait_idle idleMs 映射到 idleTime（xhr）", () => {
    const { params } = dispatchNewTool("vortex_wait_idle", { kind: "xhr", idleMs: 300 })!;
    expect(params.idleTime).toBe(300);
    expect(params).not.toHaveProperty("idleMs");
  });

  it("vortex_wait_idle idleMs 映射到 quietMs（dom）", () => {
    const { params } = dispatchNewTool("vortex_wait_idle", { kind: "dom", idleMs: 500 })!;
    expect(params.quietMs).toBe(500);
    expect(params).not.toHaveProperty("idleMs");
  });

  it("vortex_fill kind:cascader → dom.commit", () => {
    const { action } = dispatchNewTool("vortex_fill", { kind: "cascader", value: "x" })!;
    expect(action).toBe("dom.commit");
  });

  it("vortex_fill kind:checkbox-group → dom.commit", () => {
    const { action } = dispatchNewTool("vortex_fill", { kind: "checkbox-group", value: ["a"] })!;
    expect(action).toBe("dom.commit");
  });

  it("vortex_fill 无 kind → dom.fill", () => {
    const { action } = dispatchNewTool("vortex_fill", { value: "x" })!;
    expect(action).toBe("dom.fill");
  });

  it("vortex_evaluate async:false → js.evaluate", () => {
    const { action } = dispatchNewTool("vortex_evaluate", { code: "1+1", async: false })!;
    expect(action).toBe("js.evaluate");
  });

  it("vortex_evaluate async:true → js.evaluateAsync", () => {
    const { action } = dispatchNewTool("vortex_evaluate", { code: "await fetch('/')", async: true })!;
    expect(action).toBe("js.evaluateAsync");
  });

  it("vortex_screenshot 无 target → capture.screenshot", () => {
    const { action } = dispatchNewTool("vortex_screenshot", {})!;
    expect(action).toBe("capture.screenshot");
  });

  it("vortex_screenshot 有 selector → capture.element", () => {
    const { action } = dispatchNewTool("vortex_screenshot", { selector: "#x" })!;
    expect(action).toBe("capture.element");
  });

  it("vortex_console op:get → console.getLogs", () => {
    const { action } = dispatchNewTool("vortex_console", { op: "get" })!;
    expect(action).toBe("console.getLogs");
  });

  it("vortex_console op:clear → console.clear", () => {
    const { action } = dispatchNewTool("vortex_console", { op: "clear" })!;
    expect(action).toBe("console.clear");
  });

  it("vortex_network op:get 无 filter → network.getLogs", () => {
    const { action } = dispatchNewTool("vortex_network", { op: "get" })!;
    expect(action).toBe("network.getLogs");
  });

  it("vortex_network op:get + filter → network.filter", () => {
    const { action } = dispatchNewTool("vortex_network", { op: "get", filter: { url: "/api" } })!;
    expect(action).toBe("network.filter");
  });

  it("vortex_network op:clear → network.clear", () => {
    const { action } = dispatchNewTool("vortex_network", { op: "clear" })!;
    expect(action).toBe("network.clear");
  });

  it("vortex_storage_get scope:cookie → storage.getCookies", () => {
    const { action } = dispatchNewTool("vortex_storage_get", { scope: "cookie" })!;
    expect(action).toBe("storage.getCookies");
  });

  it("vortex_storage_get scope:local → storage.getLocalStorage", () => {
    const { action } = dispatchNewTool("vortex_storage_get", { scope: "local" })!;
    expect(action).toBe("storage.getLocalStorage");
  });

  it("vortex_storage_get scope:session → storage.getSessionStorage", () => {
    const { action } = dispatchNewTool("vortex_storage_get", { scope: "session" })!;
    expect(action).toBe("storage.getSessionStorage");
  });

  it("vortex_storage_set scope:cookie → storage.setCookie", () => {
    const { action } = dispatchNewTool("vortex_storage_set", { scope: "cookie", name: "k", value: "v" })!;
    expect(action).toBe("storage.setCookie");
  });

  it("vortex_storage_set scope:cookie op:delete → storage.deleteCookie", () => {
    const { action } = dispatchNewTool("vortex_storage_set", { scope: "cookie", op: "delete", name: "k" })!;
    expect(action).toBe("storage.deleteCookie");
  });

  it("vortex_storage_set scope:local → storage.setLocalStorage", () => {
    const { action } = dispatchNewTool("vortex_storage_set", { scope: "local", key: "k", value: "v" })!;
    expect(action).toBe("storage.setLocalStorage");
  });

  it("vortex_storage_session op:export → storage.exportSession", () => {
    const { action } = dispatchNewTool("vortex_storage_session", { op: "export", domain: "e.com" })!;
    expect(action).toBe("storage.exportSession");
  });

  it("vortex_storage_session op:import → storage.importSession", () => {
    const { action } = dispatchNewTool("vortex_storage_session", { op: "import", data: {} })!;
    expect(action).toBe("storage.importSession");
  });

  it("vortex_file_list_downloads → file.getDownloads", () => {
    const { action } = dispatchNewTool("vortex_file_list_downloads", {})!;
    expect(action).toBe("file.getDownloads");
  });

  // v0.7.1 P2 fix: vortex_act(scroll) value 是参数对象而非数据值
  it("vortex_act(scroll, value={container, position}) 把 value spread 到 args", () => {
    const { action, params } = dispatchNewTool("vortex_act", {
      target: "body",
      action: "scroll",
      value: { container: ".scroll-box", position: "bottom" },
    })!;
    expect(action).toBe("dom.scroll");
    expect(params.container).toBe(".scroll-box");
    expect(params.position).toBe("bottom");
    // target 必须被 strip，否则底层 dom.scroll 走 scrollIntoView 屏蔽 container/position
    expect(params).not.toHaveProperty("target");
    // value 字段不应再透传（避免底层误读）
    expect(params).not.toHaveProperty("value");
  });

  it("vortex_act(scroll, value={x, y}) 同样 spread + strip target", () => {
    const { params } = dispatchNewTool("vortex_act", {
      target: "body",
      action: "scroll",
      value: { x: 100, y: 500 },
    })!;
    expect(params.x).toBe(100);
    expect(params.y).toBe(500);
    expect(params).not.toHaveProperty("target");
    expect(params).not.toHaveProperty("value");
  });

  it("vortex_act(fill, value='hello') 仍透传 value（数据值语义不变）", () => {
    const { action, params } = dispatchNewTool("vortex_act", {
      action: "fill",
      target: "@e1",
      value: "hello",
    })!;
    expect(action).toBe("dom.fill");
    expect(params.value).toBe("hello");
  });

  it("vortex_act(scroll, target=...) 不传 value 时也通", () => {
    const { action, params } = dispatchNewTool("vortex_act", {
      action: "scroll",
      target: "._listItem:last-child",
    })!;
    expect(action).toBe("dom.scroll");
    expect(params.target).toBe("._listItem:last-child");
    expect(params).not.toHaveProperty("value");
  });

  it("未知工具名返回 null（走 toolDef.action 默认路径）", () => {
    const result = dispatchNewTool("vortex_click", {});
    expect(result).toBeNull();
  });

  it("工具总数应为 36", async () => {
    const { getAllToolDefs } = await import("../src/tools/schemas.js");
    expect(getAllToolDefs().length).toBe(36);
  });
});
