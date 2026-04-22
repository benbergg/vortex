<script setup lang="ts">
import { ref } from "vue";

const value = ref("");

interface Item { value: string }
const options: Item[] = [
  { value: "apple" },
  { value: "apricot" },
  { value: "banana" },
  { value: "blueberry" },
  { value: "cherry" },
];

function querySearch(queryString: string, cb: (arr: Item[]) => void): void {
  const q = queryString.toLowerCase();
  // 模拟 async debounce
  setTimeout(() => {
    cb(options.filter((o) => o.value.toLowerCase().startsWith(q)));
  }, 100);
}
</script>

<template>
  <h1>el-autocomplete（async fetch-suggestions）</h1>
  <p>输入触发 100ms delay 的建议列表，验证 driver/case 能等异步 popper。</p>
  <div class="widget-wrap" data-testid="target-autocomplete">
    <el-autocomplete
      v-model="value"
      :fetch-suggestions="querySearch"
      placeholder="输入关键词"
      style="width: 240px"
    />
  </div>
  <div class="result" data-testid="result">value={{ value || "(空)" }}</div>
</template>
