<script setup lang="ts">
import { ref } from "vue";

const activeTab = ref("tab1");
const tab2Input = ref("");
</script>

<template>
  <h1>el-tabs + 懒加载子 widget</h1>
  <p>验证切 Tab 后能操作 Tab 内部的 widget。</p>
  <div class="widget-wrap" data-testid="target-tabs">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="Tab 1" name="tab1">
        <p>Tab 1 内容</p>
      </el-tab-pane>
      <el-tab-pane label="Tab 2" name="tab2">
        <div data-testid="tab2-input">
          <el-input v-model="tab2Input" placeholder="Tab 2 内输入" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="Tab 3" name="tab3" lazy>
        <p>Tab 3 lazy 内容</p>
      </el-tab-pane>
    </el-tabs>
  </div>
  <div class="result" data-testid="result">
    active={{ activeTab }} tab2Input={{ tab2Input || "(空)" }}
  </div>
</template>
