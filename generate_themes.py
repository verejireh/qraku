import os
import re

# 원본 라벤더 테마 소스 코드
lavender_source_path = "frontend-react/src/views/themes/LavenderThemeView.jsx"
with open(lavender_source_path, "r", encoding="utf-8") as f:
    template = f.read()

# 하드코딩된 라벤더 전용 색상 및 속성을 범용 Tailwind CSS 변수로 교체
template = template.replace('bg-[#f9f7ff]', 'bg-[var(--background-light)]')
template = template.replace('bg-[#f9f7ff]/90', 'bg-[var(--background-light)]/90')
template = template.replace('text-[#6a5e8d]', 'text-primary/70')

themelist = [
    {
        "name": "Ajisai",
        "bg_class": "hydrangea-bg"
    },
    {
        "name": "Bamboo",
        "bg_class": "bamboo-bg"
    },
    {
        "name": "Camellia",
        "bg_class": "camellia-pattern"
    },
    {
        "name": "Cosmos",
        "bg_class": "cosmos-bg"
    },
    {
        "name": "Sunflower",
        "bg_class": "sunflower-bg"
    }
]

for theme in themelist:
    name = theme["name"]
    bg_class = theme["bg_class"]

    # 컴포넌트 이름 변경
    new_content = template.replace("LavenderThemeView", f"{name}ThemeView")
    
    # 배경 클래스 삽입 (z-0)
    bg_div = f'\n            {{"/* Pattern Overlay */"}}\n            <div className="fixed inset-0 {bg_class} pointer-events-none z-0"></div>\n'
    
    # className="relative min-h-screen ..." 바로 아래에 패턴 bg 삽입
    # <div className="relative min-h-screen ..."> 찾기
    match = re.search(r'(<div className="relative min-h-screen[^>]*>)', new_content)
    if match:
        insert_pos = match.end()
        new_content = new_content[:insert_pos] + bg_div + new_content[insert_pos:]
    else:
        print(f"Warning: Could not insert bg pattern for {name}")

    # Description 변경
    new_content = new_content.replace(
        'Savor the elegant essence of Lavender.', 
        f'Experience the unique style of {name}.'
    )

    # z-index 버그(bg-cover 가리면 안됨) 수정을 위해 메인 파트 z-10 보장
    # <div className="max-w-md mx-auto ...> 들에 z-10 추가
    new_content = new_content.replace('className="max-w-md mx-auto px-4 pt-4"', 'className="relative z-10 max-w-md mx-auto px-4 pt-4"')
    new_content = new_content.replace('className="sticky top-[64px] z-40', 'className="sticky top-[64px] z-40 relative"')
    new_content = new_content.replace('<main className="max-w-md mx-auto p-4 space-y-8">', '<main className="relative z-10 max-w-md mx-auto p-4 space-y-8">')

    out_path = f"frontend-react/src/views/themes/{name}ThemeView.jsx"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    
    print(f"Generated {out_path}")

# LavenderThemeView 자체도 배경 변수화 적용하여 업데이트
with open(lavender_source_path, "w", encoding="utf-8") as f:
    # Lavender는 패턴 bg_class 필요 없음
    lavender_update = template.replace('className="max-w-md mx-auto px-4 pt-4"', 'className="relative z-10 max-w-md mx-auto px-4 pt-4"')
    lavender_update = lavender_update.replace('<main className="max-w-md mx-auto p-4 space-y-8">', '<main className="relative z-10 max-w-md mx-auto p-4 space-y-8">')
    f.write(lavender_update)

print("Updated LavenderThemeView.jsx")
