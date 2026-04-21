<script setup lang="ts">
import { ref } from "vue";

const selected = ref<string[]>([]);

const options = [
  { value: "A", label: "Option A" },
  { value: "B", label: "Option B" },
  { value: "C", label: "Option C" },
  { value: "D", label: "Option D" },
  { value: "E", label: "Option E" },
];
</script>

<template>
  <h1>el-select 多选（tag）</h1>
  <p>验证 vortex_fill kind=select value=['A','C'] 能否把多个值写进 el-select multiple。</p>
  <div class="widget-wrap" data-testid="target-select-multiple">
    <el-select
      v-model="selected"
      multiple
      collapse-tags
      placeholder="请选择多项"
      style="width: 320px"
    >
      <el-option
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
  </div>
  <div class="result" data-testid="result">选中值：[{{ selected.join(",") }}]</div>
</template>
