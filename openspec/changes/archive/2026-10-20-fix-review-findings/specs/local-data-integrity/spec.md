# Spec Delta

## ADDED Requirements

### Requirement: 导入必须拒绝重复的记录 id
系统 SHALL 在导入校验时检查 `sessions` 中记录 `id` 的唯一性；存在重复 `id` 时拒绝导入、不改动现有数据、不写盘。

#### Scenario: 导入含重复 id 的数据
- **WHEN** 导入的 JSON 中两条记录的 `id` 相同
- **THEN** 显示失败原因说明存在重复的记录 id，现有记录与草稿保持不变

#### Scenario: 导入 id 全部唯一的数据
- **WHEN** 导入的 JSON 通过其余全部结构校验且所有记录 `id` 互不相同
- **THEN** 校验通过，按既有导入流程进入确认与写盘环节
