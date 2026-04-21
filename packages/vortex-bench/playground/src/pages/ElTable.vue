<script setup lang="ts">
import { ref } from "vue";

const tableData = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
  { id: 3, name: "Carol", age: 28 },
];

const selectedIds = ref<number[]>([]);
const editedRow = ref<number | null>(null);

function handleSelectionChange(rows: typeof tableData) {
  selectedIds.value = rows.map((r) => r.id);
}

function handleEdit(row: { id: number }) {
  editedRow.value = row.id;
}
</script>

<template>
  <h1>el-table 多选 + 展开行 + 行内按钮</h1>
  <p>验证 vortex 能否定位"第 N 行的勾选框 / 编辑按钮"。</p>
  <div class="widget-wrap" data-testid="target-table">
    <el-table :data="tableData" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="40" />
      <el-table-column type="expand">
        <template #default="{ row }">
          <div style="padding: 8px 16px">expanded for {{ row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="Name" width="120" />
      <el-table-column prop="age" label="Age" width="80" />
      <el-table-column label="Action" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">编辑 {{ row.id }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
  <div class="result" data-testid="result">
    selected=[{{ selectedIds.join(",") }}] edited={{ editedRow ?? "(none)" }}
  </div>
</template>
