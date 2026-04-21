<script setup lang="ts">
import { ref } from "vue";

const range = ref<[Date, Date] | null>(null);
</script>

<template>
  <h1>el-date-picker datetimerange</h1>
  <p>验证 vortex_fill kind=datetimerange value={start,end} 能否正确落值。</p>
  <div class="widget-wrap" data-testid="target-datetimerange">
    <el-date-picker
      v-model="range"
      type="datetimerange"
      start-placeholder="开始时间"
      end-placeholder="结束时间"
      format="YYYY-MM-DD HH:mm:ss"
      value-format="YYYY-MM-DD HH:mm:ss"
    />
  </div>
  <div class="result" data-testid="result">
    <template v-if="range && range.length === 2">
      start={{ range[0] }}<br />end={{ range[1] }}
    </template>
    <template v-else>(未设置)</template>
  </div>
</template>
