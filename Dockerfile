FROM node:10-alpine
WORKDIR /usr/src/app
COPY ["package.json", "yarn.lock", "./"]
RUN yarn install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
CMD npm start