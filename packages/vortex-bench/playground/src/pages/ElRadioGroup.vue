<script setup lang="ts">
import { ref } from "vue";

const selected = ref<string>("");
</script>

<template>
  <h1>el-radio-group</h1>
  <p>验证选中某个 radio 后 v-model 更新。</p>
  <div class="widget-wrap" data-testid="target-radio-group">
    <el-radio-group v-model="selected">
      <el-radio value="A" label="A">选项 A</el-radio>
      <el-radio value="B" label="B">选项 B</el-radio>
      <el-radio value="C" label="C">选项 C</el-radio>
    </el-radio-group>
  </div>
  <div class="result" data-testid="result">选中：{{ selected || "(未选)" }}</div>
</template>
