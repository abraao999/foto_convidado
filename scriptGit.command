#!/bin/zsh

# npm run build
git add .

echo "mensagem do commit"
read message
git commit -m "$message"
git push -u origin main
# git push -u heroku main
