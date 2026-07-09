import logging
from pythonjsonlogger import jsonlogger

logger = logging.getLogger("academic_suite")
logger.setLevel(logging.INFO)

log_handler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
log_handler.setFormatter(formatter)
logger.addHandler(log_handler)
