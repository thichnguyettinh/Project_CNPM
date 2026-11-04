with open('d:/project_cnpm/assets/js/modules/teacher/user-management.js', 'rb') as f:
    c = f.read()

# Thay đổi dropdown toggle: dùng position fixed với tọa độ từ getBoundingClientRect
old = b"""      // Toggle dropdown khi click n\xc3\xbat \xe2\x8b\xae\r\n      menuBtn.addEventListener('click', (e) => {\r\n        e.stopPropagation();\r\n        // \xc4\x90\xc3\xb3ng t\xe1\xba\xa5t c\xe1\xba\xa3 dropdown \xc4\x91ang m\xe1\xbb\x9f kh\xc3\xa1c\r\n        document.querySelectorAll('.action-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });\r\n        dropdown.classList.toggle('open');\r\n      });"""

new = b"""      // Toggle dropdown khi click n\xc3\xbat \xe2\x8b\xae - d\xc3\xb9ng position fixed tr\xc3\xa1nh b\xe1\xbb\x8b clip b\xe1\xbb\x9fi overflow\r\n      menuBtn.addEventListener('click', (e) => {\r\n        e.stopPropagation();\r\n        const isOpen = dropdown.classList.contains('open');\r\n        // \xc4\x90\xc3\xb3ng t\xe1\xba\xa5t c\xe1\xba\xa3 dropdown \xc4\x91ang m\xe1\xbb\x9f kh\xc3\xa1c\r\n        document.querySelectorAll('.action-dropdown.open').forEach(d => {\r\n          d.classList.remove('open');\r\n          d.style.removeProperty('position');\r\n          d.style.removeProperty('top');\r\n          d.style.removeProperty('right');\r\n          d.style.removeProperty('left');\r\n        });\r\n        if (!isOpen) {\r\n          const rect = menuBtn.getBoundingClientRect();\r\n          dropdown.style.position = 'fixed';\r\n          dropdown.style.top = (rect.bottom + 4) + 'px';\r\n          dropdown.style.right = (window.innerWidth - rect.right) + 'px';\r\n          dropdown.style.left = 'auto';\r\n          dropdown.classList.add('open');\r\n        }\r\n      });"""

print('old found:', old in c)
c2 = c.replace(old, new, 1)
print('changed:', c != c2)
with open('d:/project_cnpm/assets/js/modules/teacher/user-management.js', 'wb') as f:
    f.write(c2)
print('done')
