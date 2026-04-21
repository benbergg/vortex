<script setup lang="ts">
import { ref } from "vue";

const visible = ref(false);
const inside = ref("");
</script>

<template>
  <h1>el-drawer + 内嵌 input</h1>
  <p>抽屉从右滑出，内部 input 测试 driver 能否在 drawer 里定位。</p>
  <div class="widget-wrap" data-testid="target-drawer-trigger">
    <el-button type="primary" @click="visible = true">打开抽屉</el-button>
  </div>
  <el-drawer v-model="visible" title="抽屉" size="320px">
    <div data-testid="drawer-input">
      <el-input v-model="inside" placeholder="抽屉内输入" />
    </div>
  </el-drawer>
  <div class="result" data-testid="result">
    drawerOpen={{ visible }} inside={{ inside || "(未输入)" }}
  </div>
</template>
