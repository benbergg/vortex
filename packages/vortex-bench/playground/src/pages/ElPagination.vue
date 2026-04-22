<script setup lang="ts">
import { ref } from "vue";

const page = ref(1);
const size = ref(10);
</script>

<template>
  <h1>el-pagination（sizes + pager + jumper）</h1>
  <p>验证 click 页码、切 size 能更新 v-model。</p>
  <div class="widget-wrap" data-testid="target-pagination">
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="size"
      :page-sizes="[10, 20, 50, 100]"
      :total="200"
      layout="sizes, prev, pager, next, jumper"
    />
  </div>
  <div class="result" data-testid="result">page={{ page }} size={{ size }}</div>
</template>
