# Use the official Debian-based PostgreSQL 16 image
FROM postgres:16-bookworm

# Install prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    lsb-release \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Add official PostgreSQL APT repository for pgvector
RUN wget -O /usr/share/keyrings/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# Download and install the Groonga APT source package
RUN wget https://packages.groonga.org/debian/groonga-apt-source-latest-$(lsb_release --codename --short).deb && \
    apt-get update && \
    apt-get install -y --no-install-recommends ./groonga-apt-source-latest-$(lsb_release --codename --short).deb && \
    rm groonga-apt-source-latest-$(lsb_release --codename --short).deb

# Update and install extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-16-pgdg-pgroonga \
    postgresql-16-pgvector

# The init.sql script for creating extensions will be run by the entrypoint
