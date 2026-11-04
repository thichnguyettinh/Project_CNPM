with open('d:/project_cnpm/pages/teacher/users.html', 'rb') as f:
    c = f.read()

old = b"tableAccountContainer {\r\n      overflow: visible;\r\n      width: 100%;\r\n    }\r\n    #tableAccountContainer table {\r\n      width: 100%;\r\n      border-collapse: collapse;\r\n      table-layout: fixed;\r\n    }\r\n    #tableAccountContainer th,\r\n    #tableAccountContainer td {\r\n      vertical-align: middle !important;\r\n      white-space: nowrap !important;\r\n      overflow: hidden;\r\n      text-overflow: ellipsis;\r\n    }\r\n    /* C\xe1\xbb\x99t T\xc3\xa0i kho\xe1\xba\xa3n gi\xe1\xbb\xaf l\xe1\xba\xa1i wrapping v\xc3\xac c\xc3\xb3 2 d\xc3\xb2ng */\r\n    #tableAccountContainer td:first-child {\r\n      white-space: normal !important;\r\n      overflow: visible;\r\n    }"

new = b"tableAccountContainer {\r\n      overflow: visible;\r\n      width: 100%;\r\n    }\r\n    #tableAccountContainer table {\r\n      width: 100%;\r\n      border-collapse: collapse;\r\n      table-layout: auto;\r\n    }\r\n    #tableAccountContainer th,\r\n    #tableAccountContainer td {\r\n      vertical-align: middle !important;\r\n      white-space: nowrap;\r\n    }"

print('old found:', old in c)
c2 = c.replace(old, new, 1)
print('changed:', c != c2)
with open('d:/project_cnpm/pages/teacher/users.html', 'wb') as f:
    f.write(c2)
print('done')
