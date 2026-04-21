<script setup lang="ts">
import { ref } from "vue";

const selected = ref<string>("");

const options = [
  { value: "A", label: "Option A" },
  { value: "B", label: "Option B" },
  { value: "C", label: "Option C" },
  { value: "D", label: "Option D" },
  { value: "E", label: "Option E" },
];
</script>

<template>
  <h1>el-select 单选</h1>
  <p>验证 vortex_fill kind=select 能否把值写进 Element Plus 的 el-select。</p>
  <div class="widget-wrap" data-testid="target-select">
    <el-select
      v-model="selected"
      placeholder="请选择"
      style="width: 240px"
    >
      <el-option
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
  </div>
  <div class="result" data-testid="result">选中值：{{ selected || "(未选)" }}</div>
</template>
