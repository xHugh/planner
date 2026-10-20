# Spec Delta

## Purpose

定义 Service Worker 的缓存命名空间与清理范围：本应用只管理自己的缓存条目，同一 origin 上其他应用的缓存不得被本应用的激活流程删除。

## ADDED Requirements

### Requirement: 缓存清理限定在本应用命名空间

系统 SHALL 只清理属于本应用的缓存条目（缓存名以本应用前缀 `gym4-` 命名）；同一 origin 上其他应用创建的缓存 SHALL 保持不变。该约束在缓存版本递增后仍然成立。

#### Scenario: 同 origin 存在其他应用的缓存

- **WHEN** 本应用的新版本 Service Worker 激活，且同一 origin 下存在其他应用创建的缓存条目
- **THEN** 只删除本应用的历史版本缓存，其他应用的缓存条目仍然存在且内容未被修改

#### Scenario: 本应用缓存版本递增

- **WHEN** 本应用的缓存版本号递增后 Service Worker 激活
- **THEN** 本应用旧版本的缓存被删除，本应用当前版本的缓存保留
