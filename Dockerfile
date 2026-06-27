FROM nginx:alpine

# Copy static assets into the NGINX directory
COPY *.html /usr/share/nginx/html/
COPY *.css /usr/share/nginx/html/
COPY *.js /usr/share/nginx/html/
COPY *.svg /usr/share/nginx/html/

# Expose the port (Cloud Run sets the PORT environment variable, usually 8080)
# Update NGINX configuration to listen on the PORT environment variable
CMD sed -i -e 's/80/'"$PORT"'/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
