FROM node:10-alpine
ENV NODE_ENV production
ENV MYSQL_HOST 192.168.0.16
ENV MYSQL_USER makerpanel
ENV MYSQL_PASSWORD makerpassword
ENV MYSQL_DATABASE makerpanel
ENV EMAIL_NOTIFICATIONS_API_KEY ''
ENV EMAIL_NOTIFICATIONS_DOMAIN ''
ENV EMAIL_NOTIFICATIONS_LIST ''
WORKDIR /usr/src/app
COPY ["package.json", "yarn.lock", "./"]
RUN yarn install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
CMD npm start