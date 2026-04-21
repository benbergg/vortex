<script setup lang="ts">
import { ref } from "vue";

const num = ref<number | undefined>();
</script>

<template>
  <h1>el-input-number</h1>
  <p>数字输入 + 上下箭头，验证键入与 step 按钮。</p>
  <div class="widget-wrap" data-testid="target-input-number">
    <el-input-number v-model="num" :min="0" :max="100" :step="2" placeholder="0-100" />
  </div>
  <div class="result" data-testid="result">num={{ num === undefined ? "(未设置)" : num }}</div>
</template>
