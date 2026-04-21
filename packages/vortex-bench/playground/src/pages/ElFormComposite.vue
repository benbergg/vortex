<script setup lang="ts">
import { reactive, ref } from "vue";

const form = reactive({
  name: "",
  level: "",
  enabled: false,
  tags: [] as string[],
});

const submitted = ref<string>("");

function handleSubmit() {
  submitted.value = JSON.stringify(form);
}
</script>

<template>
  <h1>el-form 组合</h1>
  <p>多 widget 联动场景（input + select + switch + checkbox-group + submit）。验证表单字段能否被逐个定位和填值。</p>
  <div class="widget-wrap" data-testid="target-form">
    <el-form :model="form" label-width="100px" style="max-width: 480px">
      <el-form-item label="名称">
        <!-- 用 div 包一层统一 testid 落外层（el-input 会把 attrs 透传到 native input，不一致）-->
        <div data-testid="form-name">
          <el-input v-model="form.name" />
        </div>
      </el-form-item>
      <el-form-item label="级别">
        <div data-testid="form-level">
          <el-select v-model="form.level" placeholder="请选择" style="width: 180px">
            <el-option label="低" value="low" />
            <el-option label="中" value="mid" />
            <el-option label="高" value="high" />
          </el-select>
        </div>
      </el-form-item>
      <el-form-item label="启用">
        <div data-testid="form-enabled">
          <el-switch v-model="form.enabled" />
        </div>
      </el-form-item>
      <el-form-item label="标签">
        <div data-testid="form-tags">
          <el-checkbox-group v-model="form.tags">
            <el-checkbox value="alpha" label="alpha" />
            <el-checkbox value="beta" label="beta" />
            <el-checkbox value="gamma" label="gamma" />
          </el-checkbox-group>
        </div>
      </el-form-item>
      <el-form-item>
        <div data-testid="form-submit">
          <el-button type="primary" @click="handleSubmit">提交</el-button>
        </div>
      </el-form-item>
    </el-form>
  </div>
  <div class="result" data-testid="result">
    <template v-if="submitted">提交：{{ submitted }}</template>
    <template v-else>(未提交)</template>
  </div>
</template>
