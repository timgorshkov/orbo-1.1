#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import subprocess

# Get original file from Git
content = subprocess.check_output(
    ['git', 'show', 'HEAD:app/app/[org]/telegram/groups/[id]/page.tsx'],
    text=True,
    encoding='utf-8'
)

# Replace URLs
content = content.replace('/app/${params.org}/telegram', '/p/${params.org}/telegram')

# Write to new location
with open('app/p/[org]/telegram/groups/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('File created successfully!')

