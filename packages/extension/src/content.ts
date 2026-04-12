chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message: any): Promise<unknown> {
  switch (message.type) {
    case "js.evaluate":
      return evalInPage(message.code);
    case "js.evaluateAsync":
      return evalAsyncInPage(message.code);
    case "ping":
      return { pong: true };
    default:
      return { error: `Unknown content message type: ${message.type}` };
  }
}

function evalInPage(code: string): unknown {
  try {
    const fn = new Function(code);
    return { result: fn() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function evalAsyncInPage(code: string): Promise<unknown> {
  try {
    const fn = new Function(`return (async () => { ${code} })()`);
    const result = await fn();
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
