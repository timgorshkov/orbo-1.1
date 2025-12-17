#!/usr/bin/env python3
with open("docker-compose.yml", "r") as f:
    content = f.read()

# Fix the escaped quotes
content = content.replace('- \\ 127.0.0.1:9999:8080\\', '- "127.0.0.1:9999:8080"')

with open("docker-compose.yml", "w") as f:
    f.write(content)

print("Fixed!")

