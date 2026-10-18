// 4 分化固定器械训练计划 —— 唯一数据源
// 数据来自对话中确认的方案（v3 减伤版，动作全保留）
window.PLAN = {
  version: 3,
  title: "4 分化 · 固定器械 · 减伤版",
  rules: [
    "每组先做 50-60% 重量的试探组，确认轨迹后再上正式重量",
    "动作开始变形（骨盆卷起 / 躯干甩动 / 膝盖内扣）就结束该组，不练到力竭（RIR 1-2）",
    "离心 2-3 秒，不靠惯性回弹",
    "推类和腿屈伸在顶端接近伸直但不硬锁死",
    "任何关节刺痛 / 卡顿立即停该动作",
    "第一周用能轻松做满规定次数的 70-80% 重量",
    "每 4 周减载一次：组数 -40%，重量 -10%",
  ],
  redFlags: [
    "关节刺痛、卡顿、弹响伴疼痛（不是肌肉酸）",
    "疼痛 0-10 评分 ≥ 4，或训练后 24-48 小时不消退",
    "肢体麻木、放射痛（手臂发麻、腿后侧窜电）",
    "重量没变却突然做不动，或动作明显代偿",
    "休息一周后同一部位疼痛仍不缓解",
  ],
  days: [
    {
      id: "w1", name: "W1 胸+三头", short: "推", focus: "胸大肌 · 三角前束 · 三头",
      moves: [
        { name: "坐姿推胸机", img: "chest_press", sets: 4, lo: 8, hi: 10, tip: "主项；脚踩稳、下背贴垫、肩胛下沉后收，推到手臂接近伸直不锁死" },
        { name: "上斜推胸机", img: "incline_press", sets: 3, lo: 10, hi: 12, tip: "上胸；握距略宽于肩，下放到胸上侧即返回" },
        { name: "蝴蝶机夹胸", img: "pec_deck", sets: 3, lo: 12, hi: 15, tip: "肘微屈固定，胸口打开不耸肩，顶端停 1 秒" },
        { name: "双杠臂屈伸辅助机", img: null, sets: 3, lo: 10, hi: 12, tip: "辅助重量给足，躯干前倾 15-30°，下到肩不超伸就推；肩前侧有夹痛感就停，换蝴蝶机" },
        { name: "三头推臂机", img: null, sets: 3, lo: 12, hi: 15, tip: "肘固定在身体两侧，只动小臂" },
        { name: "绳索下压", img: null, sets: 3, lo: 12, hi: 15, tip: "轻-中重量；肘贴身体，不靠体重压" },
        { name: "肩袖外旋（绳索，轻）", img: null, sets: 2, lo: 15, hi: 15, tip: "收尾稳定练习；重量小、慢速" },
      ],
    },
    {
      id: "w2", name: "W2 背+二头", short: "拉", focus: "背阔 · 中背 · 二头",
      moves: [
        { name: "高位下拉", img: "lat_pulldown", sets: 4, lo: 8, hi: 10, tip: "主项；胸口微抬、收下巴，拉到锁骨高度即可，不往后甩" },
        { name: "坐姿划船机", img: "seated_row", sets: 4, lo: 10, hi: 12, tip: "躯干保持中立不晃，肩胛先后缩再拉" },
        { name: "单臂器械划船", img: "lat_pulldown_alt", sets: 3, lo: 12, hi: 15, tip: "单侧做，感受背阔肌，避免躯干扭转" },
        { name: "直臂下压", img: null, sets: 3, lo: 12, hi: 15, tip: "手臂近乎伸直走弧线，背不要塌" },
        { name: "器械弯举", img: null, sets: 3, lo: 10, hi: 12, tip: "上臂贴紧支撑垫，不甩、不借力" },
        { name: "绳索锤式弯举", img: null, sets: 3, lo: 12, hi: 15, tip: "练肱肌/前臂，慢离心" },
      ],
    },
    {
      id: "w3", name: "W3 肩+中后束", short: "肩", focus: "三角中束 · 三角后束 · 核心",
      moves: [
        { name: "坐姿肩推机", img: "shoulder_press", sets: 4, lo: 8, hi: 10, tip: "主项；背靠稳，下放到手肘略低于肩就推" },
        { name: "器械侧平举", img: null, sets: 4, lo: 12, hi: 15, tip: "小重量慢节奏，不耸肩、不甩" },
        { name: "反向飞鸟机", img: null, sets: 4, lo: 15, hi: 20, tip: "后束；肩胛轻微后收，幅度不用贪大" },
        { name: "绳索面拉", img: null, sets: 3, lo: 15, hi: 20, tip: "拉到额头/眼睛高度，外旋收尾" },
        { name: "耸肩机", img: null, sets: 3, lo: 12, hi: 15, tip: "垂直上下，顶端停 1 秒，不做圆周滚肩" },
        { name: "绳索卷腹", img: null, sets: 3, lo: 12, hi: 15, tip: "含胸卷腹而非髋屈" },
      ],
    },
    {
      id: "w4", name: "W4 腿+核心", short: "腿", focus: "股四头 · 腘绳 · 小腿",
      moves: [
        { name: "腿举机", img: "leg_press", sets: 4, lo: 8, hi: 10, tip: "主项；脚掌踩满、膝盖方向与脚尖一致，不放到骨盆卷起" },
        { name: "哈克深蹲", img: "hack_squat", sets: 3, lo: 10, hi: 12, tip: "脚位略高、下到大腿平行就停" },
        { name: "腿屈伸机", img: "leg_extension", sets: 3, lo: 12, hi: 15, tip: "伸到顶端停 1 秒，不快速甩腿" },
        { name: "俯卧/坐姿腿弯举", img: "leg_curl", sets: 4, lo: 12, hi: 15, tip: "慢离心，顶端不要完全放松" },
        { name: "提踵机（坐姿或站姿）", img: "calf_raise", sets: 4, lo: 15, hi: 20, tip: "最低点充分拉伸，顶端停 1 秒" },
        { name: "器械卷腹/平板支撑", img: null, sets: 3, lo: 12, hi: 15, tip: "二选一；腰不塌（平板支撑按 40-60 秒计）" },
      ],
    },
    {
      id: "r1", name: "R1 补强+有氧（可选）", short: "补", focus: "三角中后束 · 手臂 · 稳定性",
      moves: [
        { name: "坐姿肩推机（轻）", img: "shoulder_press", sets: 3, lo: 12, hi: 15, tip: "RIR 3，只为维持不追重量；也可换（轻）上斜推胸机" },
        { name: "器械侧平举", img: null, sets: 3, lo: 15, hi: 15, tip: "三角中束泵感" },
        { name: "反向飞鸟机", img: null, sets: 3, lo: 15, hi: 15, tip: "三角后束" },
        { name: "绳索下压", img: null, sets: 3, lo: 12, hi: 15, tip: "三头" },
        { name: "器械弯举", img: null, sets: 3, lo: 12, hi: 15, tip: "二头" },
        { name: "绳索外旋 + Y-T-W", img: null, sets: 2, lo: 15, hi: 15, tip: "肩袖与外展肌群；轻重量" },
        { name: "臀中肌侧抬腿 / 弹力带侧步", img: null, sets: 2, lo: 15, hi: 20, tip: "髋稳定，保护膝盖与下背" },
        { name: "椭圆机/台阶机", img: null, sets: 1, lo: 20, hi: 30, tip: "低-中强度，能说话（按分钟计）", cardio: true },
      ],
    },
  ],
  // 周一 ~ 周日，null 表示休息
  week: ["w1", "w2", null, "w3", "w4", "r1", null],
  weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};

// 器械图鉴（图片来自 Wikimedia Commons，授权见 credits）
window.GALLERY = [
  { key: "chest_press", name: "坐姿推胸机", day: "W1 主项", tip: "肩胛下沉后收，把手停在胸口高度" },
  { key: "incline_press", name: "上斜推胸机", day: "W1", tip: "握距略宽于肩，下放到胸上侧" },
  { key: "pec_deck", name: "蝴蝶机（夹胸）", day: "W1", tip: "肘微屈固定，胸口打开不耸肩" },
  { key: "chest_fly", name: "蝴蝶机（另一款）", day: "W1", tip: "不同品牌轨迹相近，先轻重量找感觉" },
  { key: "lat_pulldown", name: "高位下拉", day: "W2 主项", tip: "拉到锁骨高度即可，不往后甩" },
  { key: "lat_pulldown_alt", name: "高位下拉（单站式）", day: "W2", tip: "单站式需自己控制躯干稳定" },
  { key: "seated_row", name: "坐姿划船机", day: "W2", tip: "躯干中立不晃，肩胛先后缩再拉" },
  { key: "shoulder_press", name: "坐姿肩推机", day: "W3 主项", tip: "背靠稳，手肘略低于肩就推" },
  { key: "leg_press", name: "腿举机", day: "W4 主项", tip: "脚掌踩满，膝盖方向与脚尖一致" },
  { key: "leg_press_alt", name: "腿举机（斜推款）", day: "W4", tip: "不放到骨盆卷起，下背不离垫" },
  { key: "smith_machine", name: "史密斯机", day: "W4 备选", tip: "滑轨固定，站距与脚位需先试" },
  { key: "hack_squat", name: "哈克深蹲机", day: "W4", tip: "脚位略高，下到大腿平行就停" },
  { key: "leg_extension", name: "腿屈伸机", day: "W4", tip: "顶端停 1 秒，不快速甩腿" },
  { key: "leg_curl", name: "仰卧腿弯举机", day: "W4", tip: "慢离心，顶端不要完全放松" },
  { key: "calf_raise", name: "坐姿提踵机", day: "W4", tip: "最低点充分拉伸，顶端停 1 秒" },
];

window.CREDITS = [
  { name: "坐姿推胸机", artist: "Tyler Read", license: "CC BY 2.0", page: "https://commons.wikimedia.org/wiki/File:Girl_doing_chest_press_machine_exercise.jpg" },
  { name: "上斜推胸机 / 蝴蝶机 / 肩推机", artist: "Aliva Sahoo", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Chest_Incline.jpg" },
  { name: "蝴蝶机（另一款）", artist: "SAgbley", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Chest_Fly_Machine_1.jpg" },
  { name: "高位下拉", artist: "Teddyhtsai", license: "CC0", page: "https://commons.wikimedia.org/wiki/File:Diverging_Lat_Pulldown_Machine.jpg" },
  { name: "高位下拉（单站式）", artist: "Santeri Viinamäki", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Lat_pulldown_machine_20180112.jpg" },
  { name: "坐姿划船机", artist: "Miguel Angel Omaña Rojas", license: "CC0", page: "https://commons.wikimedia.org/wiki/File:Woman_using_a_seated_cable_row_machine_at_the_gym.jpg" },
  { name: "腿举机", artist: "SAgbley", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Leg_Press_1.jpg" },
  { name: "腿举机（斜推款）", artist: "Teemeah", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Leg_press_machine.jpg" },
  { name: "史密斯机", artist: "Wikideas1", license: "CC0", page: "https://commons.wikimedia.org/wiki/File:Smith_machine.webp" },
  { name: "哈克深蹲 / 腿屈伸 / 腿弯举", artist: "George Stepanek", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:HackSquatMachineExercise.JPG" },
  { name: "坐姿提踵机", artist: "George Stepanek", license: "CC BY-SA 3.0", page: "https://commons.wikimedia.org/wiki/File:SeatedCalfRaiseMachineExercise.JPG" },
];
