<script setup lang="ts">
import { ref } from "vue";
import { ElMessageBox } from "element-plus";

const action = ref<string>("");

async function showConfirm() {
  try {
    await ElMessageBox.confirm("确认要继续吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    action.value = "确认";
  } catch {
    action.value = "取消";
  }
}
</script>

<template>
  <h1>el-message-box（命令式）</h1>
  <p>验证 ElMessageBox.confirm 触发的弹窗 — DOM 由 JS 动态挂到 body，不在组件树。</p>
  <div class="widget-wrap" data-testid="target-msgbox-trigger">
    <el-button type="primary" @click="showConfirm">弹确认框</el-button>
  </div>
  <div class="result" data-testid="result">用户操作：{{ action || "(无)" }}</div>
</template>
