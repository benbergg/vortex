import { createApp } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import App from "./App.vue";
import Home from "./pages/Home.vue";
import ElDropdown from "./pages/ElDropdown.vue";
import ElSelectSingle from "./pages/ElSelectSingle.vue";
import ElSelectMultiple from "./pages/ElSelectMultiple.vue";
import ElCascader from "./pages/ElCascader.vue";
import ElDatePickerDatetimeRange from "./pages/ElDatePickerDatetimeRange.vue";
import ElDatePickerDateRange from "./pages/ElDatePickerDateRange.vue";
import ElFormComposite from "./pages/ElFormComposite.vue";
import ElTree from "./pages/ElTree.vue";
import ElTable from "./pages/ElTable.vue";
import ElDialogNested from "./pages/ElDialogNested.vue";
import ElUpload from "./pages/ElUpload.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/el-dropdown", component: ElDropdown },
    { path: "/el-select-single", component: ElSelectSingle },
    { path: "/el-select-multiple", component: ElSelectMultiple },
    { path: "/el-cascader", component: ElCascader },
    { path: "/el-date-picker-datetimerange", component: ElDatePickerDatetimeRange },
    { path: "/el-date-picker-daterange", component: ElDatePickerDateRange },
    { path: "/el-form-composite", component: ElFormComposite },
    { path: "/el-tree", component: ElTree },
    { path: "/el-table", component: ElTable },
    { path: "/el-dialog-nested", component: ElDialogNested },
    { path: "/el-upload", component: ElUpload },
  ],
});

createApp(App).use(router).use(ElementPlus).mount("#app");
