from typing import Annotated

from annotated_types import Ge, Le

Latitude = Annotated[float, Ge(-90), Le(90)]
Longitude = Annotated[float, Ge(-180), Le(180)]
