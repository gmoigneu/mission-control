import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Column, inspect


def model_to_dict(obj: Any) -> dict[str, Any]:
    """JSON-serializable snapshot of a mapped object's columns."""
    return {
        attr.key: _jsonable(getattr(obj, attr.key)) for attr in inspect(obj).mapper.column_attrs
    }


def _jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def coerce_value(model: type, key: str, value: Any) -> Any:
    """Convert a JSON value back to the python type of the model column."""
    if value is None:
        return None
    column: Column[Any] = inspect(model).columns[key]
    try:
        pytype = column.type.python_type
    except NotImplementedError:
        return value
    if pytype is uuid.UUID and isinstance(value, str):
        return uuid.UUID(value)
    if pytype is datetime and isinstance(value, str):
        return datetime.fromisoformat(value)
    if pytype is date and isinstance(value, str):
        return date.fromisoformat(value)
    if pytype is Decimal and isinstance(value, (int, float, str)):
        return Decimal(str(value))
    return value
