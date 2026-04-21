<script setup lang="ts">
import { ref } from "vue";

const selected = ref<string[]>([]);

const options = [
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
      {
        value: "杭州",
        label: "杭州",
        children: [
          { value: "西湖", label: "西湖" },
          { value: "滨江", label: "滨江" },
        ],
      },
    ],
  },
  {
    value: "华北",
    label: "华北",
    children: [
      {
        value: "北京",
        label: "北京",
        children: [
          { value: "朝阳", label: "朝阳" },
          { value: "海淀", label: "海淀" },
        ],
      },
    ],
  },
];
</script>

<template>
  <h1>el-cascader 级联</h1>
  <p>验证 vortex_fill kind=cascader value=[华东,上海,浦东] 能否逐层定位。</p>
  <div class="widget-wrap" data-testid="target-cascader">
    <el-cascader
      v-model="selected"
      :options="options"
      placeholder="请选择"
      style="width: 320px"
    />
  </div>
  <div class="result" data-testid="result">选中路径：[{{ selected.join("/") }}]</div>
</template>
