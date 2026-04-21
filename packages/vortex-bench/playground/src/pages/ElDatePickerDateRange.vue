<script setup lang="ts">
import { ref } from "vue";

const range = ref<[string, string] | null>(null);
</script>

<template>
  <h1>el-date-picker daterange（对照 datetimerange）</h1>
  <p>无 time 的 daterange，验证 driver 跨月填值是否同样有问题。</p>
  <div class="widget-wrap" data-testid="target-daterange">
    <el-date-picker
      v-model="range"
      type="daterange"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      format="YYYY-MM-DD"
      value-format="YYYY-MM-DD"
    />
  </div>
  <div class="result" data-testid="result">
    <template v-if="range && range.length === 2">
      start={{ range[0] }}<br />end={{ range[1] }}
    </template>
    <template v-else>(未设置)</template>
  </div>
</template>
