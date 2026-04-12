export class StateCache {
  private consoleLogs: unknown[] = [];
  private networkLogs: unknown[] = [];
  private maxSize = 1000;

  addConsoleLog(entry: unknown): void {
    this.consoleLogs.push(entry);
    if (this.consoleLogs.length > this.maxSize) this.consoleLogs.shift();
  }

  addNetworkLog(entry: unknown): void {
    this.networkLogs.push(entry);
    if (this.networkLogs.length > this.maxSize) this.networkLogs.shift();
  }

  getConsoleLogs(): unknown[] { return this.consoleLogs; }
  getNetworkLogs(): unknown[] { return this.networkLogs; }
  clearConsoleLogs(): void { this.consoleLogs = []; }
  clearNetworkLogs(): void { this.networkLogs = []; }
}
