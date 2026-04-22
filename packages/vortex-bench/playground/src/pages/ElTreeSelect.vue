<script setup lang="ts">
import { ref } from "vue";

const selected = ref<string>("");

const data = [
  {
    value: "华东",
    label: "华东",
    children: [
      {
        value: "上海",
        label: "上海",
        children: [
          { value: "浦东", label: "浦东" },
          { value: "徐汇", label: "徐汇" },
        ],
      },
      { value: "杭州", label: "杭州" },
    ],
  },
  {
    value: "华北",
    label: "华北",
    children: [{ value: "北京", label: "北京" }],
  },
];
</script>

<template>
  <h1>el-tree-select（tree 作 select 选项）</h1>
  <p>验证 tree-select 展开 + 选叶子节点。</p>
  <div class="widget-wrap" data-testid="target-tree-select">
    <el-tree-select
      v-model="selected"
      :data="data"
      placeholder="请选择"
      style="width: 280px"
    />
  </div>
  <div class="result" data-testid="result">value={{ selected || "(未选)" }}</div>
</template>
