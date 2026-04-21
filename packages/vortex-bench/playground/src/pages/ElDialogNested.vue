<script setup lang="ts">
import { ref } from "vue";

const dialogVisible = ref(false);
const insideSelect = ref<string>("");

const options = [
  { value: "X", label: "X" },
  { value: "Y", label: "Y" },
  { value: "Z", label: "Z" },
];
</script>

<template>
  <h1>el-dialog + 嵌套 el-select</h1>
  <p>验证 dialog（teleport）+ select（再 teleport）的嵌套 popper 场景下 observe 是否能区分内外。</p>
  <div class="widget-wrap" data-testid="target-dialog-trigger">
    <el-button type="primary" @click="dialogVisible = true">打开对话框</el-button>
  </div>

  <el-dialog v-model="dialogVisible" title="选择" width="420px">
    <p>请在对话框里选一个选项：</p>
    <div data-testid="inside-select">
      <el-select v-model="insideSelect" placeholder="请选择" style="width: 240px">
        <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
    </div>
  </el-dialog>

  <div class="result" data-testid="result">
    dialogOpen={{ dialogVisible }} inside={{ insideSelect || "(none)" }}
  </div>
</template>
