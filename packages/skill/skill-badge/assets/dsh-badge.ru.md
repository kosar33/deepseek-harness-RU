# Бейдж dsh

[English](dsh-badge.md) | Русский

Добавляйте официальный бейдж «powered by dsh», не создавая его заново и не меняя его оформление.

## Ресурсы

- Локальный PNG: [`dsh-badge.png`](dsh-badge.png), исходное изображение 726×120; отображать в размере 121×20
- URL изображения Shields.io: `https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white`
- URL проекта: `https://github.com/deepseek-ai/deepseek-harness`

## Markdown

Используйте в Markdown этот бейдж со ссылкой:

```markdown
[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
```

Если атрибуция не должна быть ссылкой, используйте:

```markdown
![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)
```

## Правила использования

- Для GitHub или GitLab Markdown используйте URL Shields.io и свяжите его с URL проекта, если пользователь не попросил изображение без ссылки.
- Для Feishu и других систем, ненадёжно импортирующих удалённые изображения, загрузите `dsh-badge.png` из каталога этого скилла вместо генерации другого бейджа.
- Сохраняйте размеры бейджа 121×20 и его пропорции.
- Помещайте бейдж в конец документа или раздела, которому адресована атрибуция, если пользователь не указал другое место.
- Не подменяйте цвет, логотип, подпись или URL проекта на другие.
