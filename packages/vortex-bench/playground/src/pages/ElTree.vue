<script setup lang="ts">
import { ref } from "vue";

const picked = ref<string>("");

const data = [
  {
    label: "华东",
    children: [
      { label: "上海", children: [{ label: "浦东" }, { label: "徐汇" }] },
      { label: "杭州", children: [{ label: "西湖" }, { label: "滨江" }] },
    ],
  },
  {
    label: "华北",
    children: [
      { label: "北京", children: [{ label: "朝阳" }, { label: "海淀" }] },
    ],
  },
];

function handleNodeClick(node: { label: string }) {
  picked.value = node.label;
}
</script>

<template>
  <h1>el-tree 树</h1>
  <p>验证展开节点 + 深层点击。节点默认折叠，必须先点父节点展开才能点子节点。</p>
  <div class="widget-wrap" data-testid="target-tree" style="width: 300px">
    <el-tree
      :data="data"
      node-key="label"
      :props="{ label: 'label', children: 'children' }"
      @node-click="handleNodeClick"
    />
  </div>
  <div class="result" data-testid="result">选中节点：{{ picked || "(未选)" }}</div>
</template>
