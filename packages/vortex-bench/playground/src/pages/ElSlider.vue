<script setup lang="ts">
import { ref } from "vue";

const val = ref(20);
</script>

<template>
  <h1>el-slider（键盘或拖拽）</h1>
  <p>验证能否把滑块从 20 调到 50。</p>
  <div class="widget-wrap" data-testid="target-slider" style="width: 400px">
    <el-slider v-model="val" :min="0" :max="100" show-input />
  </div>
  <div class="result" data-testid="result">val={{ val }}</div>
</template>
