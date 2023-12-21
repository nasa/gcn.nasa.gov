from datetime import datetime
from typing import List, Optional

import astropy.units as u  # type: ignore
import numpy as np
from astropy.coordinates import FK5, CartesianRepresentation, SkyCoord  # type: ignore
from astropy.time import Time  # type: ignore


from ..functions import round_time
from .common import ACROSSAPIBase
from .ephem import EphemBase
from .saa import SAABase
from .schema import JobInfo, VisibilityGetSchema, VisibilitySchema
from .window import MakeWindowBase


class VisibilityBase(ACROSSAPIBase, MakeWindowBase):
    """Calculate visibility of a given object.

    Parameters
    ----------
    ram_cons
        Flag indicating whether to apply Ram constraint (avoidance of direction of motion).
    pole_cons
        Flag indicating whether to apply Pole constraint.
    sun_cons
        Flag indicating whether to apply Sun constraint.
    moon_cons
        Flag indicating whether to apply Moon constraint.
    earth_cons
        Flag indicating whether to apply Earth constraint.
    saa_cons
        Flag indicating whether to apply SAA (South Atlantic Anomaly) constraint.
    earthoccult
        Extra angle in degrees to be added to the Earth constraint.
    moonoccult
        Extra angle in degrees to be added to the Moon constraint.
    sunoccult
        Extra angle in degrees to be added to the Sun constraint.
    ramsize
        Size of the Ram constraint in degrees.
    sunextra
        Extra angle in degrees to be added to the Sun constraint.
    ramextra
        Extra angle in degrees to be added to the Ram constraint.
    earthextra
        Extra angle in degrees to be added to the Earth constraint.
    moonextra
        Extra angle in degrees to be added to the Moon constraint.
    isat
        Flag indicating whether the object is a satellite.
    entries
        List of time windows during which the object is visible.
    ra
        Right Ascension of the object in degrees.
    dec
        Declination of the object in degrees.
    status
        Information about the job status.
    begin
        Start time of the visibility calculation.
    end
        End time of the visibility calculation.
    velocity
        Flag indicating whether velocity information is available.
    saa
        SAA (South Atlantic Anomaly) information.
    ephem
        Ephemeris information.
    stepsize
        Step size for the visibility calculation.

    Attributes
    ----------
    timestamp
        Array of timestamps for the visibility calculation.
    inearthcons
        List of boolean values indicating whether the object is within the Earth constraint.
    inramcons
        Array of boolean values indicating whether the object is within the Ram constraint.
    inpolecons
        Array of boolean values indicating whether the object is within the Pole constraint.
    insuncons
        Array of boolean values indicating whether the object is within the Sun constraint.
    inmooncons
        Array of boolean values indicating whether the object is within the Moon constraint.
    skycoord
        Sky coordinates of the object.
    saa_windows
        List of time windows during which the object is outside the SAA (South Atlantic Anomaly).

    Methods
    -------
    __getitem__(self, i)
        Get the i-th entry from the entries list.
    __len__(self)
        Get the length of the entries list.
    insaa(self, dttime)
        Check if the object is within the SAA (South Atlantic Anomaly) at a given datetime.
    visible(self, dttime)
        Check if the object is visible at a given datetime.
    get(self)
        Query visibility for a given RA/Dec.
    constraint(self, index)
        Get the type of constraint at a given time index.

    """

    _schema = VisibilitySchema
    _get_schema = VisibilityGetSchema

    # Constraint definitions
    ram_cons: bool
    pole_cons: bool
    sun_cons: bool
    moon_cons: bool
    earth_cons: bool
    saa_cons: bool
    earthoccult: float
    moonoccult: float
    sunoccult: float
    ramsize: float
    sunextra: float
    ramextra: float
    earthextra: float
    moonextra: float
    isat: bool
    entries: list
    ra: float
    dec: float
    status: JobInfo
    begin: datetime
    end: datetime
    velocity: bool
    saa: SAABase
    ephem: EphemBase
    stepsize: int

    def __getitem__(self, i):
        return self.entries[i]

    def __len__(self):
        return len(self.timestamp)

    @property
    def timestamp(self):
        return self.ephem.timestamp[self.ephstart : self.ephstop]

    @property
    def inearthcons(self) -> List[bool]:
        if not hasattr(self, "_inearthcons"):
            earthang = self.ephem.earth[self.ephstart : self.ephstop].separation(
                self.skycoord
            )

            earth_cons = self.earthoccult * u.deg  # type: ignore
            if not self.isat:
                earth_cons += self.earthextra * u.deg  # type: ignore

            self._inearthcons = earthang < earth_cons + self.ephem.earthsize[self.ephstart : self.ephstop] * u.deg  # type: ignore

        return self._inearthcons

    @property
    def inramcons(self) -> Optional[np.ndarray]:
        """Calculate Ram constraint (avoidance of direction of motion)"""
        if self.ephem.velocity is not False and self.ephem.velvec is not None:
            if not hasattr(self, "_inramcons"):
                # calculate the angle between the velocity vector and the RA/Dec vector
                self.ramang = SkyCoord(
                    CartesianRepresentation(
                        x=self.ephem.velvec[self.ephstart : self.ephstop].T
                    )
                ).separation(self.skycoord)

                # calculate the size of the ram constraint
                ram_cons = self.ramsize * u.deg  # type: ignore
                if not self.isat:
                    ram_cons += self.ramextra * u.deg  # type: ignore
                # return the constraint
                self._inramcons = self.ramang < ram_cons
            return self._inramcons
        return None

    @property
    def inpolecons(self) -> Optional[np.ndarray]:
        """Determine if a source is in pole constraint"""
        # Calculate the size of the pole constraint
        if self.ephem.velocity is not False and self.ephem.polevec is not None:
            if not hasattr(self, "_inpolecons"):
                pole_cons = (
                    self.ephem.earthsize[self.ephstart : self.ephstop]
                    + self.earthoccult
                    - 90
                ) * u.deg  # type: ignore
                if not self.isat:
                    pole_cons += self.earthextra * u.deg

                # Calculate the angular distance from the North and South poles
                north_dist = self.ephem.pole[self.ephstart : self.ephstop].separation(
                    self.skycoord
                )

                south_dist = SkyCoord(
                    CartesianRepresentation(
                        -self.ephem.polevec[self.ephstart : self.ephstop].T
                    )
                ).separation(self.skycoord)

                # Create an array of pole constraints
                self._inpolecons = np.logical_or(
                    south_dist < pole_cons, north_dist < pole_cons
                )
            return self._inpolecons
        return None

    @property
    def insuncons(self):
        """Calculate Sun constraint"""
        if not hasattr(self, "_insuncons"):
            sunang = self.ephem.sun[self.ephstart : self.ephstop].separation(
                self.skycoord
            )

            sun_cons = self.sunoccult * u.deg  # type: ignore
            if not self.isat:
                sun_cons += self.sunextra * u.deg  # type: ignore
            self._insuncons = sunang < sun_cons
        return self._insuncons

    @property
    def inmooncons(self):
        """Calculate Moon constraint"""
        if not hasattr(self, "_inmooncons"):
            moonang = self.ephem.moon[self.ephstart : self.ephstop].separation(
                self.skycoord
            )

            moon_cons = self.moonoccult * u.deg  # type: ignore
            if not self.isat:
                moon_cons += self.moonextra * u.deg  # type: ignore
            self._inmooncons = moonang < moon_cons
        return self._inmooncons

    @property
    def skycoord(self):
        """Create array of RA/Dec and vector of these"""
        if hasattr(self, "_skycoord") is False:
            if self.ephem.apparent:
                sc = SkyCoord(self.ra * u.deg, self.dec * u.deg)  # type: ignore
                equinox = FK5(
                    equinox=Time(
                        self.ephem.timestamp[self.ephstart : self.ephstop],
                        format="datetime",
                    )
                )
                self._skycoord = sc.transform_to(equinox)
            else:
                self._skycoord = SkyCoord(self.ra, self.dec, unit=u.deg)
        return self._skycoord

    @property
    def saa_windows(self):
        """Calculate SAA windows"""
        if not hasattr(self, "_saa_windows"):
            self._saa_windows = self.make_windows([not s for s in self.insaacons])
        return self._saa_windows

    def insaa(self, dttime):
        """For a given datetime, are we in the SAA as calculated by saa_windows?"""
        for win in self.saa_windows:
            if dttime >= win.begin and dttime <= win.end:
                return True
        return False

    def visible(self, dttime):
        """For a given datetime, is the target visible?"""
        for win in self.entries:
            if dttime >= win[0] and dttime <= win[1]:
                return True
        return False

    @property
    def ephstart(self):
        return self.ephem.ephindex(self.begin)

    @property
    def ephstop(self):
        return self.ephem.ephindex(self.end) + 1

    def get(self):
        """Query visibility for a given RA/Dec."""
        # Round begin to the nearest minute
        self.begin = round_time(self.begin, 60)

        # Reset windows
        self.entries = list()

        # Check everything is kosher, if just run calculation
        if not self.validate_get():
            return False

        # Set up the constraint array
        self.inconstraint = np.zeros(len(self.timestamp), dtype=bool)

        # Calculate SAA constraint
        if self.saa_cons is True:
            self.inconstraint = self.insaacons

        # Calculate Earth constraint
        if self.earth_cons is True:
            self.inconstraint += self.inearthcons

        # Calculate Moon constraint
        if self.moon_cons is True:
            self.inconstraint += self.inmooncons

        # Calculate Sun constraint
        if self.sun_cons is True:
            self.inconstraint += self.insuncons

        # Calculate Pole constraint
        if self.pole_cons is True and self.inpolecons is not None:
            self.inconstraint += self.inpolecons

        # Calculate Ram constraint
        if self.ram_cons is True and self.inramcons is not None:
            self.inconstraint += self.inramcons

        # Calculate good windows from combined constraints
        self.entries = self.make_windows(self.inconstraint)
        if len(self.entries) == 0:
            self.status.warning("No visibility for target in given time period.")

    def constraint(self, index: int) -> str:
        """Tell you what kind of constraints are in place at a given time index"""
        # Check if index is out of bounds
        if self.timestamp[index] <= self.begin or self.timestamp[index] >= self.end:
            return "Window"
        # Return what constraint is causing the window to open/close
        if self.inconstraint[index]:
            if self.insuncons[index]:
                return "Sun"
            elif self.inmooncons[index]:
                return "Moon"
            elif self.inearthcons[index]:
                return "Earth"
            elif self.insaacons[index]:
                return "SAA"
            else:
                return "Unknown"
        else:
            return "None"

    @property
    def insaacons(self) -> list:
        """Calculate SAA constraint using SAA Polygon"""
        return self.saa.insaacons[self.ephstart : self.ephstop]
