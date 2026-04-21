<script setup lang="ts">
import { ref } from "vue";

interface UploadFile { name: string; status?: string }

const uploaded = ref<string[]>([]);

function onChange(_file: UploadFile, fileList: UploadFile[]) {
  uploaded.value = fileList.map((f) => f.name);
}
</script>

<template>
  <h1>el-upload 文件上传</h1>
  <p>验证 vortex_file_upload 能否对接 hidden input[type=file]。</p>
  <div class="widget-wrap" data-testid="target-upload">
    <el-upload
      action="/_dev/null"
      :auto-upload="false"
      :on-change="onChange"
    >
      <el-button type="primary">选择文件</el-button>
    </el-upload>
  </div>
  <div class="result" data-testid="result">files=[{{ uploaded.join(",") }}]</div>
</template>
