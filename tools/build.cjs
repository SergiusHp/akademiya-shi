// Збирає один самодостатній файл index.html зі src/. Запуск: node tools/build.cjs
const fs = require('fs'), path = require('path');
const r = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(r, f), 'utf8');
const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Академія ШІ — інтерактивний курс зі штучного інтелекту</title>
<meta name="description" content="Безкоштовний інтерактивний курс українською: промпти, токени, дослідження, сайти, агенти й Telegram-боти. Уроки, практика, тести й власний прогрес у браузері.">
<meta property="og:title" content="Академія ШІ">
<meta property="og:description" content="Інтерактивний курс зі штучного інтелекту українською: від першого запиту до агентів і Telegram-ботів.">
<meta property="og:type" content="website">
<meta name="theme-color" content="#2A3BD1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232A3BD1'/%3E%3Crect x='6' y='19' width='20' height='7' rx='2' fill='%23FFDE40'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${read('src/styles.css')}
</style>
</head>
<body>
<div id="app"></div>
<template id="tpl">${read('src/template.html')}</template>
<script>
const COURSE = ${read('src/course.json').trim()};
${read('src/runtime.js')}
${read('src/logic.js')}
logic = new Component({}); render(); if (logic.componentDidMount) logic.componentDidMount();
</script>
</body>
</html>`;
fs.writeFileSync(path.join(r, 'index.html'), html);
console.log('index.html', Math.round(html.length / 1024), 'KB');
