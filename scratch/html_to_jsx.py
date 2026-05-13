import sys
import re

def style_to_object(style_str):
    styles = []
    for part in style_str.split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            k = k.strip()
            v = v.strip().replace("'", "\\'")
            k = re.sub(r'-([a-z])', lambda m: m.group(1).upper(), k)
            styles.append(f"{k}: '{v}'")
    return "{{ " + ", ".join(styles) + " }}"

def html_to_jsx(html):
    html = html.replace('class="', 'className="')
    html = html.replace('for="', 'htmlFor="')
    html = re.sub(r'<(input|img|br|hr|meta|link)([^>]*?)(?<!/)>', r'<\1\2 />', html)
    html = re.sub(r'style="([^"]*)"', lambda m: "style={" + style_to_object(m.group(1)) + "}", html)
    
    for event in ['onclick', 'onchange', 'onkeydown', 'oninput', 'onload', 'onerror']:
        # Replace event handlers with empty arrows or comment them out
        html = re.sub(r'\b' + event + r'="([^"]*)"', r'', html) 
        
    html = re.sub(r'<!--(.*?)-->', r'{/* \1 */}', html, flags=re.DOTALL)
    return html

if __name__ == '__main__':
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract body content (inside <body>...</body>)
    body_match = re.search(r'<body>(.*?)<script>', content, re.DOTALL)
    if body_match:
        body = body_match.group(1)
        jsx = html_to_jsx(body)
        with open(sys.argv[2], 'w', encoding='utf-8') as out:
            out.write(jsx)
        print("Converted body to JSX")
    else:
        print("Could not extract body")
