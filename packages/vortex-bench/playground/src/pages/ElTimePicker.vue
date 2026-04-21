<script setup lang="ts">
import { ref } from "vue";

const time = ref<string>("");
</script>

<template>
  <h1>el-time-picker</h1>
  <p>验证 time picker 能填值（spinner 列选择）。</p>
  <div class="widget-wrap" data-testid="target-time-picker">
    <el-time-picker
      v-model="time"
      placeholder="选择时间"
      format="HH:mm:ss"
      value-format="HH:mm:ss"
    />
  </div>
  <div class="result" data-testid="result">time={{ time || "(未设置)" }}</div>
</template>
