<script setup lang="ts">
import { ref } from "vue";

const value = ref<string>("");

// 1000 条选项，模拟大数据场景；Select V2 用虚拟滚动只渲染 viewport 内
const options = Array.from({ length: 1000 }, (_, i) => ({
  value: `opt-${i}`,
  label: `Option ${i}`,
}));
</script>

<template>
  <h1>el-select-v2（虚拟滚动）</h1>
  <p>1000 条选项，只测前几条（不涉及滚动）；后续虚拟滚动能否定位由独立 case 覆盖。</p>
  <div class="widget-wrap" data-testid="target-select-v2">
    <el-select-v2
      v-model="value"
      :options="options"
      placeholder="请选择"
      filterable
      style="width: 240px"
    />
  </div>
  <div class="result" data-testid="result">value={{ value || "(未选)" }}</div>
</template>
