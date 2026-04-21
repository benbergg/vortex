<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="layout">
    <aside class="nav" data-testid="playground-nav">
      <h2>vortex-bench playground</h2>
      <ul>
        <li><RouterLink to="/">首页</RouterLink></li>
        <li><RouterLink to="/el-dropdown">el-dropdown</RouterLink></li>
        <li><RouterLink to="/el-select-single">el-select 单选</RouterLink></li>
        <li><RouterLink to="/el-select-multiple">el-select 多选</RouterLink></li>
        <li><RouterLink to="/el-cascader">el-cascader</RouterLink></li>
        <li><RouterLink to="/el-date-picker-datetimerange">datetimerange</RouterLink></li>
        <li><RouterLink to="/el-date-picker-daterange">daterange</RouterLink></li>
        <li><RouterLink to="/el-form-composite">el-form 组合</RouterLink></li>
        <li><RouterLink to="/el-tree">el-tree</RouterLink></li>
        <li><RouterLink to="/el-table">el-table</RouterLink></li>
        <li><RouterLink to="/el-dialog-nested">el-dialog + select</RouterLink></li>
        <li><RouterLink to="/el-upload">el-upload</RouterLink></li>
        <li><RouterLink to="/el-radio-group">el-radio-group</RouterLink></li>
        <li><RouterLink to="/el-time-picker">el-time-picker</RouterLink></li>
        <li><RouterLink to="/el-message-box">el-message-box</RouterLink></li>
        <li><RouterLink to="/el-drawer">el-drawer</RouterLink></li>
        <li><RouterLink to="/el-input-number">el-input-number</RouterLink></li>
      </ul>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style>
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
.layout { display: flex; min-height: 100vh; }
.nav { width: 260px; padding: 16px; background: #f5f7fa; border-right: 1px solid #e4e7ed; }
.nav h2 { font-size: 14px; color: #606266; margin: 0 0 12px; }
.nav ul { list-style: none; padding: 0; margin: 0; }
.nav li { margin-bottom: 8px; }
.nav a { color: #303133; text-decoration: none; font-size: 14px; }
.nav a.router-link-active { color: #409eff; font-weight: 600; }
.content { flex: 1; padding: 24px; }
.content h1 { font-size: 20px; margin: 0 0 16px; }
.content .widget-wrap { margin: 16px 0; }
.content .result { margin-top: 16px; padding: 8px 12px; background: #f5f7fa; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 13px; }
</style>
