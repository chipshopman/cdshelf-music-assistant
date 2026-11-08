FROM python:3.13-alpine
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
COPY www ./www
CMD ["/usr/local/bin/python", "-u", "/app/server.py"]
