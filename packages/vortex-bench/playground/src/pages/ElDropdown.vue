<script setup lang="ts">
import { ref } from "vue";

const lastClicked = ref<string>("");

function handleCommand(cmd: string) {
  lastClicked.value = cmd;
}
</script>

<template>
  <h1>el-dropdown（teleport menu）</h1>
  <p>点"打开菜单"展开下拉，选一项。验证 vortex_observe 能否捕捉到 teleport 的 menuitem。</p>
  <div class="widget-wrap" data-testid="target-dropdown">
    <el-dropdown trigger="click" @command="handleCommand">
      <el-button type="primary">打开菜单</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="选项 A">选项 A</el-dropdown-item>
          <el-dropdown-item command="选项 B">选项 B</el-dropdown-item>
          <el-dropdown-item command="选项 C">选项 C</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
  <div class="result" data-testid="result">选中：{{ lastClicked || "(未选)" }}</div>
</template>
